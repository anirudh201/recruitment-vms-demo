type StatCardProps = {
  title: string
  value: number | null
  description: string
  onClick?: () => void
}

function StatCard({
  title,
  value,
  description,
  onClick,
}: StatCardProps) {
  return (
    <article
      className={`stat-card${onClick ? ' stat-card-clickable' : ''}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <h3 className="stat-card-title">{title}</h3>

      <p className="stat-card-value">
        {value === null ? '—' : value.toLocaleString()}
      </p>

      <p className="stat-card-description">{description}</p>
    </article>
  )
}

export default StatCard