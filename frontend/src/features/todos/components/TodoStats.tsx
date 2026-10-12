import { Badge } from '../../../design-system'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'

/** Summary bar above the list: open, overdue, due soon and completed counts. */
export function TodoStats() {
  const { data } = useTodoStatsQuery()
  if (!data || data.total === 0) return null
  return (
    <div aria-label="Task summary" className="todo-stats">
      <Badge>{data.open} open</Badge>
      <Badge variant={data.overdue > 0 ? 'warning' : 'neutral'}>
        {data.overdue} overdue
      </Badge>
      {data.dueSoon > 0 && (
        <Badge variant="info">{data.dueSoon} due soon</Badge>
      )}
      <Badge variant="success">{data.completed} done</Badge>
    </div>
  )
}
