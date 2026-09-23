/** Stand-in content for a screen that exists but has nothing on it yet. */
export function placeholder(body: HTMLElement, note: string): void {
  const text = document.createElement('p')
  text.className = 'menu-placeholder'
  text.textContent = note
  body.append(text)
}
