import styles from './Home.module.css'

export function PlayerNameWithSenior({
  name,
  isSenior,
  className,
}: {
  name: string
  isSenior: boolean
  className?: string
}) {
  return (
    <span className={[styles.playerNameCell, className].filter(Boolean).join(' ')}>
      {name}
      {isSenior ? (
        <span
          className={styles.playerSeniorBadge}
          title="Senior (Gold tees)"
          aria-label="Senior (Gold tees)"
          role="img"
        />
      ) : null}
    </span>
  )
}
