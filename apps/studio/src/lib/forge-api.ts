export async function readForgeApiJson<T = Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = (await res.text()).trim();
    if (res.status === 404) {
      throw new Error(
        "Forge API route not found. Restart the studio dev server after pulling updates, then reload.",
      );
    }
    throw new Error(
      text
        ? `Unexpected ${res.status} response from Forge API.`
        : `Unexpected ${res.status} response from Forge API (empty body).`,
    );
  }

  return (await res.json()) as T;
}
