/**
 * Authenticate a batch without leaking successful peers when one handshake fails.
 * Promise.all would discard fulfilled values on the first rejection, making
 * those sockets impossible for the caller to close.
 */
export async function authenticateSocketBatch(connectAndAuthenticate, closeSockets, clients) {
  const results = await Promise.allSettled(
    clients.map(client => connectAndAuthenticate(client.id, client.username)),
  );
  const sockets = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    await closeSockets(sockets);
    throw failure.reason;
  }
  return sockets;
}
