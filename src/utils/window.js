/**
 * Ouvre une fenêtre popup centrée, contrainte à l'espace disponible de l'écran.
 * @param {string} url  URL cible
 * @param {number} preferredW  Largeur souhaitée (px)
 * @param {number} preferredH  Hauteur souhaitée (px)
 * @param {object} [options]
 * @param {string} [options.extra]  Options supplémentaires à ajouter à features (ex: 'noopener=1')
 * @returns {Window|null}
 */
export function openPopupWindow(url, preferredW, preferredH, { extra = '' } = {}) {
  try {
    const screenW = window.screen?.availWidth || window.innerWidth
    const screenH = window.screen?.availHeight || window.innerHeight
    const w = Math.min(preferredW, screenW - 40)
    const h = Math.min(preferredH, screenH - 80)
    const left = Math.max(0, Math.floor((screenW - w) / 2))
    const top = Math.max(0, Math.floor((screenH - h) / 3))
    const features = [
      'popup=yes',
      `width=${Math.round(w)}`,
      `height=${Math.round(h)}`,
      `left=${left}`,
      `top=${top}`,
      'toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1',
      ...(extra ? [extra] : []),
    ].join(',')
    const win = window.open(url, '_blank', features)
    try { win?.focus() } catch {}
    return win ?? null
  } catch {
    return null
  }
}

/**
 * Calcule les dimensions optimales pour une popup de variables.
 * @param {number} varCount  Nombre de variables
 * @param {number} columns   Nombre de colonnes souhaité (1, 2 ou 3)
 * @returns {{ w: number, h: number }}
 */
export function calcVarsPopupSize(varCount, columns = 2) {
  const cardW = 360
  const gap = 8
  const headerH = 80
  const rowH = 120
  const padding = 48
  const cols = Math.max(1, Math.min(columns, varCount || 1))
  const rows = Math.max(1, Math.ceil((varCount || 1) / cols))
  const w = cols * cardW + (cols - 1) * gap + padding
  const h = Math.min(900, headerH + rows * rowH + padding)
  return { w, h }
}
