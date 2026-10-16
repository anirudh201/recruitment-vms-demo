
type StatCardProps = {
  title: string
  value: number | null
  description: string
}

function StatCard({
  title,
  value,
  description,
}: StatCardProps) {
  return (
    <article className="stat-card">
      <h3 className="stat-card-title">{title}</h3>

      <p className="stat-card-value">
        {value === null ? '—' : value}
      </p>

      <p className="stat-card-description">
        {description}
      </p>
    </article>
  )
}

export default StatCard
