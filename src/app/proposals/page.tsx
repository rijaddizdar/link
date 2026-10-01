import { redirect } from 'next/navigation';
import { getCoupleContext, getProposals, getSession, getTasks, isLinked } from '@/lib/data';
import { effectiveStatus, partitionOpenProposals } from '@/lib/proposals';
import { ProposalCard } from './ProposalCard';
import { PROPOSAL_STATUS_LABELS } from '@/lib/proposals';

/** Everything waiting on a yes — from either side — plus what has been settled. */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const { sent } = await searchParams;
  const [proposals, tasks] = await Promise.all([getProposals(), getTasks()]);
  const titleById = new Map(tasks.map((task) => [task.id, task.title]));
  const { waitingOnMe, waitingOnPartner } = partitionOpenProposals(proposals, session.userId);

  const settled = proposals
    .filter((proposal) => effectiveStatus(proposal) !== 'pending')
    .slice(0, 20);

  return (
    <div className="stack">
      <div className="stack-tight">
        <h1>Approvals</h1>
        <p className="muted">
          Nothing changes on your shared list until you both agree. Anything left unanswered for
          seven days expires on its own.
        </p>
      </div>

      {sent === '1' && (
        <p className="notice">Sent. {context.partner?.display_name} can approve it now.</p>
      )}

      <section className="stack">
        <h2>Waiting for you</h2>
        {waitingOnMe.length === 0 ? (
          <div className="empty">
            <p>Nothing needs your approval right now.</p>
          </div>
        ) : (
          waitingOnMe.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              taskTitle={proposal.task_id ? titleById.get(proposal.task_id) ?? null : null}
              proposerName={context.partner?.display_name ?? 'Your partner'}
              mine={false}
            />
          ))
        )}
      </section>

      <section className="stack">
        <h2>Waiting for {context.partner?.display_name}</h2>
        {waitingOnPartner.length === 0 ? (
          <div className="empty">
            <p>You have nothing out for approval.</p>
          </div>
        ) : (
          waitingOnPartner.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              taskTitle={proposal.task_id ? titleById.get(proposal.task_id) ?? null : null}
              proposerName="You"
              mine
            />
          ))
        )}
      </section>

      {settled.length > 0 && (
        <section className="stack">
          <h2>Settled</h2>
          <ul className="stack-tight" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {settled.map((proposal) => (
              <li key={proposal.id} className="card">
                <div className="spread">
                  <span>
                    {proposal.payload.title ??
                      (proposal.task_id ? titleById.get(proposal.task_id) : null) ??
                      'A task'}
                  </span>
                  <span className="chip">
                    {PROPOSAL_STATUS_LABELS[effectiveStatus(proposal)]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
