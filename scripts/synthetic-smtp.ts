import net from 'node:net';
type Reply = 'accept' | 'temporary' | 'permanent' | 'finalTemporary' | 'loseReply' | 'holdReply' | 'holdRejection' | 'requireAuth' | 'authFailure';
/** Disposable loopback relay. Payloads are discarded; acceptance and recipient assertions live only in memory. */
export async function startSyntheticSmtp() {
  const controls = {
    reply: 'accept' as Reply,
    accepted: 0,
    recipients: [] as string[],
    finish: undefined as (() => void) | undefined
  };
  const clients = new Set<net.Socket>();
  const server = net.createServer(socket => {
    clients.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => clients.delete(socket));
    socket.write('220 fixture.invalid ESMTP\r\n');
    let buffer = '';
    let data = false;
    const reply = controls.reply;
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line !== '.') continue;
          data = false;
          if (reply === 'holdRejection') controls.finish = () => { socket.write('451 4.3.0 temporary fixture response\r\n'); };
          else if (reply === 'finalTemporary') socket.write('451 4.3.0 fixture-sensitive-response\r\n');else {
            controls.accepted++;
            if (reply === 'loseReply') socket.end();else if (reply === 'holdReply') controls.finish = () => socket.write('250 2.0.0 ok\r\n');else socket.write('250 2.0.0 ok\r\n');
          }
        } else if (/^(EHLO|HELO)/.test(line)) {
          socket.write(reply === 'authFailure' ? '250-fixture.invalid\r\n250 AUTH PLAIN\r\n' : '250 fixture.invalid\r\n');
        } else if (line.startsWith('AUTH')) socket.write('535 5.7.8 fixture-sensitive-response\r\n');else if (line.startsWith('MAIL FROM:')) socket.write('250 ok\r\n');else if (line.startsWith('RCPT TO:')) {
          controls.recipients.push(line.slice(8));
          socket.write(reply === 'requireAuth' ? '530 5.7.0 authentication required\r\n' : reply === 'temporary' ? '451 4.2.0 fixture-sensitive-response\r\n' : reply === 'permanent' ? '550 5.1.1 fixture-sensitive-response\r\n' : '250 ok\r\n');
        } else if (line === 'DATA') {
          data = true;
          socket.write('354 continue\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');else if (line === 'STARTTLS') socket.write('502 5.5.1 unsupported\r\n');else socket.write('502 5.5.1 unsupported\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    controls,
    port: (server.address() as net.AddressInfo).port,
    async close() {
      for (const client of clients) client.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}
