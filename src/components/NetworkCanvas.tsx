import { useEffect, useRef } from 'react'

type Node = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  pulse: number
}

export function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let raf = 0
    let nodes: Node[] = []
    let width = 0
    let height = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.max(28, Math.floor((width * height) / 22000))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.5 + Math.random() * 2.4,
        pulse: Math.random() * Math.PI * 2,
      }))
    }

    const draw = () => {
      frame += 1
      ctx.clearRect(0, 0, width, height)

      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#0b2e2f')
      gradient.addColorStop(0.45, '#123d3f')
      gradient.addColorStop(1, '#1a4f4a')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Soft atmospheric bands
      const band = ctx.createRadialGradient(width * 0.75, height * 0.2, 0, width * 0.75, height * 0.2, width * 0.55)
      band.addColorStop(0, 'rgba(61, 184, 160, 0.22)')
      band.addColorStop(1, 'rgba(61, 184, 160, 0)')
      ctx.fillStyle = band
      ctx.fillRect(0, 0, width, height)

      const linkDist = Math.min(160, width * 0.18)

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        if (!reduceMotion) {
          a.x += a.vx
          a.y += a.vy
          a.pulse += 0.02
          if (a.x < 0 || a.x > width) a.vx *= -1
          if (a.y < 0 || a.y > height) a.vy *= -1
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < linkDist) {
            const alpha = (1 - dist / linkDist) * 0.35
            ctx.strokeStyle = `rgba(232, 242, 240, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        const glow = 0.55 + Math.sin(n.pulse) * 0.25
        ctx.beginPath()
        ctx.fillStyle = `rgba(61, 184, 160, ${glow})`
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Occasional data packet pulse along a few links
      if (!reduceMotion && nodes.length > 4) {
        for (let k = 0; k < 3; k++) {
          const i = (frame + k * 11) % nodes.length
          const j = (i + 7 + k) % nodes.length
          const a = nodes[i]
          const b = nodes[j]
          const t = ((frame * 0.008) + k * 0.33) % 1
          const x = a.x + (b.x - a.x) * t
          const y = a.y + (b.y - a.y) * t
          ctx.beginPath()
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
          ctx.arc(x, y, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
