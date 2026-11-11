import { copyFile, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const destination = new URL('api-contracts/', root);
const source = new URL('contracts/', root);
const frontendRoot = new URL('../frontend/', root);
const installed = new URL('node_modules/@project/api-contracts/', frontendRoot);
const checking = process.argv.includes('--check');
const consumer = process.argv.includes('--consumer');
if (consumer && !checking) throw new Error('--consumer 只能与 --check 一起使用');
const files = ['client.d.ts', 'validation.ts'] as const;
const allowedClientImports: Readonly<Record<string, true>> = {
    'hono/client': true,
    'hono/utils/http-status': true,
    'hono/utils/types': true,
    './validation': true,
};
const allowedValidationImports: Readonly<Record<string, true>> = { zod: true };
// 沿用原同步器的公开导入白名单；只读现有源契约，绝不执行应用、Worker 或 SDK。
const backend = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const hono = backend.dependencies?.hono;
const zod = backend.dependencies?.zod;
if (
    typeof hono !== 'string' ||
    !hono ||
    typeof zod !== 'string' ||
    !zod ||
    typeof backend.version !== 'string' ||
    !backend.version
) {
    throw new Error('后端清单缺少生成契约包所需的版本信息');
}
const metadata = {
    name: '@project/api-contracts',
    version: backend.version,
    private: true,
    type: 'module',
    types: './index.d.ts',
    exports: {
        '.': { types: './index.d.ts' },
        './validation': { types: './validation.ts', default: './validation.ts' },
    },
    files: ['index.d.ts', 'client.d.ts', 'validation.ts'],
    peerDependencies: { hono, zod },
};
const expected = new Map<string, string>([
    ['package.json', `${JSON.stringify(metadata, null, 4)}\n`],
    [
        'index.d.ts',
        "// 根入口只导出类型，不把声明中的 contract 值伪装成运行时工厂。\nexport type { ApiClient } from './client.js';\n",
    ],
]);
for (const name of files) {
    const original = await readFile(new URL(name, source), 'utf8');
    const allowed = name === 'client.d.ts' ? allowedClientImports : allowedValidationImports;
    for (const match of original.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)(['"])([^'"]+)\1/g)) {
        if (!Object.hasOwn(allowed, match[2] ?? '')) {
            throw new Error(`${name} 引用了非公开浏览器依赖：${match[2]}`);
        }
    }
    expected.set(name, original);
}

if (checking) {
    const entries = await readdir(destination);
    if (entries.length !== expected.size || entries.some((name) => !expected.has(name))) {
        throw new Error('生成目录文件集合不完整或包含过期产物，请执行 contracts:prepare');
    }
    for (const [name, content] of expected) {
        if ((await readFile(new URL(name, destination), 'utf8')) !== content) {
            throw new Error(`生成契约 ${name} 已过期，请执行 bun run contracts:prepare`);
        }
    }
} else {
    // 目标完全由本脚本生成；重建时清除旧文件，检查分支从不写入。
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const [name, content] of expected) {
        if (files.some((file) => file === name)) {
            await copyFile(new URL(name, source), new URL(name, destination));
        } else {
            await writeFile(new URL(name, destination), content);
        }
    }
}

if (consumer) {
    const frontend = JSON.parse(await readFile(new URL('package.json', frontendRoot), 'utf8'));
    if (frontend.dependencies.hono !== hono) {
        throw new Error('前端 Hono 版本必须与后端公开契约版本精确一致');
    }
    if (frontend.dependencies['@project/api-contracts'] !== 'file:../backend/api-contracts') {
        throw new Error('前端必须消费 file:../backend/api-contracts');
    }
    for (const [name, content] of expected) {
        if ((await readFile(new URL(name, installed), 'utf8')) !== content) {
            throw new Error(`前端消费的 ${name} 已过期，请重新安装本地 file: 契约依赖`);
        }
    }
    console.log(`前端消费副本一致：${await realpath(fileURLToPath(installed))}`);
}
console.log(
    checking
        ? `生成契约与后端公开源一致；Hono ${hono}`
        : `已生成 ${fileURLToPath(destination)}；未执行后端运行入口`,
);
