export const generateMessageId = () => {
  const timestamp = Date.now();
  const messageId = `${timestamp}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  return { messageId, timestamp };
};
