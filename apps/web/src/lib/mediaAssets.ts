export function assetEndpointUrl(assetPath: string): string {
  return `/api/asset?${new URLSearchParams({ path: assetPath }).toString()}`;
}

export function mediaAssetCopyValue(
  action: "url" | "relative-path",
  input: { origin: string; path: string }
): string {
  return action === "url"
    ? new URL(assetEndpointUrl(input.path), input.origin).toString()
    : input.path;
}
