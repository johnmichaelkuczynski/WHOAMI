export async function retryChatRequest<T>(
  send: () => Promise<T>,
  onRetry: (attempt: number) => void,
  wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
      const transient = error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError") || [502, 503, 504].includes(status);
      if (!transient || attempt >= 2) throw error;
      onRetry(attempt + 1);
      await wait(1000 * 2 ** attempt);
    }
  }
}
