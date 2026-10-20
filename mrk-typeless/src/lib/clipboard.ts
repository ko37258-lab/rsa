/** 클립보드에 복사합니다. 막혀 있으면 false를 돌려주고, 사용자가 직접 복사하도록 안내합니다. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
