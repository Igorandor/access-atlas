// Local review of the built static artifact, including a project-site subdirectory.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const port = 3594;
const root = resolve('dist-example');
const audit = process.argv.includes('--audit');
http
  .createServer(async (request, response) => {
    if (request.headers.host !== `127.0.0.1:${port}` || request.method !== 'GET') {
      response.writeHead(403).end();
      return;
    }
    const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
    try {
      if (pathname === '/mobile.html') {
        response
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(
            '<!doctype html><title>Atlas example at390px</title><iframe title="Atlas example390px" src="/access-atlas/" style="width:390px;height:844px;border:1px solid #888"></iframe>',
          );
        return;
      }
      if (audit && pathname === '/_test/example-flow.js') {
        response
          .writeHead(200, { 'Content-Type': 'text/javascript' })
          .end(await readFile('tests/browser/example-flow.js'));
        return;
      }
      if (!pathname.startsWith('/access-atlas/')) {
        response.writeHead(404).end();
        return;
      }
      const path = resolve(root, pathname.slice('/access-atlas/'.length) || 'index.html');
      if (!path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      let body = await readFile(path);
      if (audit && path.endsWith('index.html'))
        body = Buffer.from(
          body
            .toString()
            .replace('</body>', '<script defer src="/_test/example-flow.js"></script></body>'),
        );
      const extension = path.split('.').at(-1);
      const mime =
        {
          html: 'text/html; charset=utf-8',
          js: 'text/javascript',
          css: 'text/css',
          woff: 'font/woff',
          woff2: 'font/woff2',
        }[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(
      `Built example: http://127.0.0.1:${port}/access-atlas/ ; phone: /mobile.html ; audit=${audit}`,
    ),
  );
