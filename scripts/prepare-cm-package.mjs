import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const packageDirectory = 'packages/alova';
const packageName = '@cm/alova-patched';
const repository = 'https://github.com/784933671/alova';
const revision = process.argv[2] ?? '';
const moduleReference =
  /(\b(?:from|import)\s*|\b(?:require|import)\s*\(\s*|\bdeclare\s+module\s+)(['"`])alova(\/[\w./-]+)?\2/g;
const amdDependencies = /\bdefine\s*\(\s*\[[^\]\r\n]*\]/g;
const amdReference = /(['"`])alova(\/[\w./-]+)?\1/g;

try {
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('缺少有效的构建提交 SHA');
  }

  const manifestPath = join(packageDirectory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const [upstreamVersion] = manifest.version.split('+');
  const separator = upstreamVersion.includes('-') ? '.' : '-';
  const version = `${upstreamVersion}${separator}cm.g${revision}`;

  manifest.name = packageName;
  manifest.version = version;
  manifest.description = `Alova ${upstreamVersion} 私有修复版，修复 Token 刷新失败后并发等待请求挂起。`;
  manifest.homepage = `${repository}#readme`;
  manifest.bugs = { url: `${repository}/issues` };
  manifest.repository = { type: 'git', url: `git+${repository}.git`, directory: packageDirectory };
  delete manifest.publishConfig;
  delete manifest.devDependencies;
  delete manifest.scripts;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // 改名后，构建产物和声明文件仍需引用同一个包。
  for (const directory of ['dist', 'typings']) {
    const entries = await readdir(join(packageDirectory, directory), { recursive: true, withFileTypes: true });
    await Promise.all(
      entries
        .filter(entry => entry.isFile() && /\.(?:[cm]?js|d\.[cm]?ts)$/.test(entry.name))
        .map(async entry => {
          const filename = join(entry.parentPath, entry.name);
          const source = await readFile(filename, 'utf8');
          const patched = source
            .replace(
              moduleReference,
              (_, prefix, quote, subpath = '') => `${prefix}${quote}${packageName}${subpath}${quote}`
            )
            .replace(amdDependencies, dependencies =>
              dependencies.replace(amdReference, (_, quote, subpath = '') => `${quote}${packageName}${subpath}${quote}`)
            );
          if (patched !== source) {
            await writeFile(filename, patched);
          }
        })
    );
  }

  const readmePath = join(packageDirectory, 'README.md');
  const upstreamReadme = await readFile(readmePath, 'utf8');
  const readme = `# ${packageName}

${manifest.description}

基于 alova@${upstreamVersion}，构建提交 ${revision}。

在 .npmrc 中配置 \`@cm:registry=https://www.ttxli.cn/npm/\` 并使用具有读取权限的私服身份。通过 npm 别名保留现有的 alova 导入。

\`\`\`sh
pnpm add alova@npm:${packageName}@${version}
\`\`\`

原作者、版权与 MIT 许可证保留。

${upstreamReadme}`;
  await writeFile(readmePath, readme);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
}
