import { createServer } from 'node:http';

let getAttempts = 0;
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.url !== '/api/reviews') {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'GET') {
    getAttempts += 1;
    const status = getAttempts <= 2 ? 503 : 200;
    console.log(`GET ${getAttempts}: ${status}`);
    response.writeHead(status).end(
      JSON.stringify(
        status === 503
          ? {}
          : {
              reviews: [
                {
                  id: 'retry-demo',
                  rating: 5,
                  title: 'GET recovered after two failures',
                  comment: 'This temporary local demo does not save reviews.',
                  createdAt: '2026-10-31T12:00:00.000Z',
                },
              ],
              totalCount: 1,
            },
      ),
    );
    return;
  }
  if (request.method === 'POST') {
    request.resume();
    console.log('POST: 503 (no review saved)');
    response.writeHead(503).end('{}');
    return;
  }
  response.writeHead(405).end();
});
server.listen(7072, '127.0.0.1', () => {
  console.log('Retry demonstration API: http://127.0.0.1:7072/api');
  console.log(
    'The first two GETs fail; subsequent GETs succeed. Every POST fails.',
  );
  console.log(
    'Restart this process to reset the GET counter. Stop with Ctrl+C.',
  );
});
