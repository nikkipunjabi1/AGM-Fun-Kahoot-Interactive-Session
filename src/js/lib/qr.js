// QR rendering for the lobby screen.
//
// Generated in-page rather than fetched from a QR web service: the CSP allows
// no third-party origins, and a projector that cannot reach an external API
// at 09:00 on event day would leave 1,000 people with nothing to scan.

import qrcode from 'qrcode-generator'

/**
 * Draw a QR for `text` into `element`.
 *
 * Error-correction level M tolerates roughly 15% damage, which in practice
 * means the code still scans from the back of a hall at an angle, or with a
 * head partly in the way.
 */
export function renderQr(element, text, { cellSize = 8, margin = 2 } = {}) {
  // Type 0 = auto-select the smallest version that fits the URL.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  element.innerHTML = qr.createImgTag(cellSize, margin)
  const img = element.querySelector('img')
  if (img) img.alt = `QR code to join the quiz at ${text}`
}
