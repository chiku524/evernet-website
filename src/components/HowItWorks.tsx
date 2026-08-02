import { Fragment } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Reveal } from './Reveal'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

type IconProps = { delay: number; reduce: boolean }

function drawProps(reduce: boolean, delay: number, duration = 0.7) {
  return {
    initial: reduce ? false : ({ pathLength: 0, opacity: 0 } as const),
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.6 },
    transition: { duration, delay, ease: EASE },
  }
}

function WalletIcon({ delay, reduce }: IconProps) {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <motion.rect
        x="6"
        y="12"
        width="36"
        height="26"
        rx="5"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        {...drawProps(reduce, delay, 0.8)}
      />
      <motion.path
        d="M6 20H42"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...drawProps(reduce, delay + 0.35, 0.5)}
      />
      <motion.circle
        cx="33"
        cy="29"
        r="2.6"
        fill="#3DB8A0"
        initial={reduce ? false : { opacity: 0.6 }}
        animate={reduce ? { opacity: 1 } : { scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
        transition={reduce ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: delay + 1 }}
      />
    </svg>
  )
}

function LockIcon({ delay, reduce }: IconProps) {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <motion.path
        d="M15 22V16a9 9 0 0 1 18 0v6"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...drawProps(reduce, delay, 0.7)}
      />
      <motion.rect
        x="10"
        y="22"
        width="28"
        height="18"
        rx="4"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        {...drawProps(reduce, delay + 0.3, 0.7)}
      />
      <circle cx="24" cy="31" r="2.4" fill="#3DB8A0" />
      <motion.rect
        x="10"
        y="22"
        width="28"
        height="18"
        rx="4"
        stroke="#3DB8A0"
        strokeWidth="1.5"
        fill="none"
        style={{ transformOrigin: '24px 31px' }}
        initial={{ opacity: 0 }}
        animate={reduce ? { opacity: 0 } : { opacity: [0, 0.5, 0], scale: [1, 1.28, 1.45] }}
        transition={reduce ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: delay + 1.2 }}
      />
    </svg>
  )
}

function UploadIcon({ delay, reduce }: IconProps) {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <motion.path
        d="M24 30V10M24 10L16 18M24 10L32 18"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...drawProps(reduce, delay, 0.7)}
      />
      <motion.path
        d="M10 34V38a4 4 0 0 0 4 4H34a4 4 0 0 0 4-4V34"
        stroke="#3DB8A0"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...drawProps(reduce, delay + 0.35, 0.6)}
      />
      <motion.circle
        cx="24"
        r="2.4"
        fill="#3DB8A0"
        initial={{ opacity: 0 }}
        animate={reduce ? { opacity: 0 } : { cy: [34, 22, 12], opacity: [0, 1, 0] }}
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 2, repeat: Infinity, ease: 'easeInOut', delay: delay + 1, repeatDelay: 0.4 }
        }
      />
    </svg>
  )
}

function OrbitIcon({ delay, reduce }: IconProps) {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <motion.circle cx="24" cy="24" r="14" stroke="#3DB8A0" strokeWidth="2.5" {...drawProps(reduce, delay, 0.9)} />
      <circle cx="24" cy="24" r="5" fill="#3DB8A0" />
      <motion.g
        style={{ transformOrigin: '24px 24px' }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: 'linear', delay: delay + 0.6 }}
      >
        <circle cx="24" cy="10" r="3.4" fill="#C46B3A" />
      </motion.g>
    </svg>
  )
}

const steps = [
  {
    title: 'Connect your wallet',
    body: 'Freighter, LOBSTR, Albedo, and more. Sign a SEP-10 challenge — no password, no funds move.',
    Icon: WalletIcon,
  },
  {
    title: 'Encrypt in your browser',
    body: 'Files are AES-GCM encrypted client-side with your vault passphrase before anything leaves your device.',
    Icon: LockIcon,
  },
  {
    title: 'Upload ciphertext',
    body: 'Encrypted bytes go to the S3-shaped API — fast to serve, simple to integrate.',
    Icon: UploadIcon,
  },
  {
    title: 'Stellar records the receipt',
    body: 'Soroban tracks your quota and content hash. Stellar is the control plane; bytes stay off-chain.',
    Icon: OrbitIcon,
  },
]

export function HowItWorks() {
  const reduce = Boolean(useReducedMotion())

  return (
    <div className="how-steps">
      {steps.map((step, i) => {
        const iconDelay = i * 0.12 + 0.1
        return (
          <Fragment key={step.title}>
            <Reveal className="how-step" delay={i * 0.12}>
              <span className="how-icon">
                <step.Icon delay={iconDelay} reduce={reduce} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </Reveal>
            {i < steps.length - 1 ? (
              <div className="how-connector" aria-hidden="true">
                <motion.span
                  className="how-connector-dot"
                  initial={{ opacity: 0 }}
                  animate={reduce ? { opacity: 0 } : { left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                  transition={
                    reduce ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 + 1 }
                  }
                />
              </div>
            ) : null}
          </Fragment>
        )
      })}
    </div>
  )
}
