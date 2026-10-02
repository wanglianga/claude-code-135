import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useApi, Spinner, ErrorBox, Badge, TICKET_STATUS, TICKET_TYPE, fmtDate } from '../components'

export default function Tickets() {
  const [status, setStatus] = useState('')
  const qs = status ? `?status=${status}` : ''
  const { data, error, loading } = useApi(`/tickets${qs}`, [status])
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  return <>
    <div className="flex-between">
      <h1>工单中心</h1>
      <div className="flex">
        {[['', '全部'], ['open', '待处理'], ['processing', '处理中'], ['resolved', '已解决'], ['closed', '已关闭']].map(([v, l]) => (
          <button key={v} className={`btn-sm ${status === v ? '' : 'btn-ghost'}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
    </div>
    <div className="card">
      <p className="small muted">冰雹减产、成熟延后、认养人临时改地址、果品大小不均、坏果投诉、分批配送争议、权益与实际产量不一致——所有争议在同一认养批次内闭环，农场、认养人、采摘工、包装员、物流、客服的处理结果逐笔可查。</p>
      <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>类型</th><th>标题</th><th>批次</th><th>发起人</th><th>处理流水</th><th>状态</th><th>发起时间</th><th></th></tr></thead>
        <tbody>{data.map(t => (
          <tr key={t.id}>
            <td>#{t.id}</td>
            <td><span className="badge b-earth">{TICKET_TYPE[t.type]}</span></td>
            <td>{t.title}</td>
            <td className="small">{t.batch_code}<br />{t.project_name}</td>
            <td className="small">{t.raised_by_name}</td>
            <td>{t.event_count} 条</td>
            <td><Badge map={TICKET_STATUS} value={t.status} /></td>
            <td className="small">{fmtDate(t.created_at)}</td>
            <td><Link to={`/batches/${t.batch_id}`}><button className="btn-sm btn-ghost">去批次查看</button></Link></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  </>
}
