// Lightweight canvas confetti for the final leaderboard and the winner reveal.
//
// Hand-rolled rather than imported: the whole effect is ~60 lines, and it
// keeps the big-screen bundle small enough to load instantly even if the AV
// laptop is on the same congested Wi-Fi as everyone else.

const COLOURS = ['#4F17A8', '#05BFE0', '#FF610F', '#00A878', '#FFFFFF']

export function burst(canvas, { count = 160, duration = 3200 } = {}) {
  // Honour the user's motion preference — a full-screen particle storm is a
  // genuine accessibility problem for some people.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const resize = () => {
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const w = () => canvas.offsetWidth
  const h = () => canvas.offsetHeight

  const pieces = Array.from({ length: count }, () => ({
    x: Math.random() * w(),
    y: -20 - Math.random() * h() * 0.5,
    size: 5 + Math.random() * 8,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 2 + Math.random() * 3.6,
    spin: (Math.random() - 0.5) * 0.25,
    angle: Math.random() * Math.PI * 2,
    colour: COLOURS[(Math.random() * COLOURS.length) | 0],
  }))

  const started = performance.now()
  let frame

  const draw = (now) => {
    const elapsed = now - started
    ctx.clearRect(0, 0, w(), h())

    // Fade out over the final second rather than vanishing abruptly.
    const fade = elapsed > duration - 1000
      ? Math.max(0, 1 - (elapsed - (duration - 1000)) / 1000)
      : 1
    ctx.globalAlpha = fade

    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.angle += p.spin
      if (p.y > h() + 20) { p.y = -20; p.x = Math.random() * w() }

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle)
      ctx.fillStyle = p.colour
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }

    if (elapsed < duration) frame = requestAnimationFrame(draw)
    else { ctx.clearRect(0, 0, w(), h()); window.removeEventListener('resize', resize) }
  }

  frame = requestAnimationFrame(draw)

  return () => {
    cancelAnimationFrame(frame)
    ctx.clearRect(0, 0, w(), h())
    window.removeEventListener('resize', resize)
  }
}
