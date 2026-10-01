import { redirect } from 'next/navigation';
import { getCoupleContext, getProposals, getSession, getTasks, isLinked } from '@/lib/data';
import {
  PROPOSAL_STATUS_LABELS,
  effectiveStatus,
  partitionOpenProposals,
} from '@/lib/proposals';
import { ProposalCard } from './ProposalCard';

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

  const partnerName = context.partner?.display_name ?? 'Your partner';
  const settled = proposals.filter((p) => effectiveStatus(p) !== 'pending').slice(0, 20);

  return (
    <>
      <div className="l-stack-tight">
        <h1>Approvals</h1>
        <p className="l-muted">
          Nothing changes on your shared list until you both agree. Anything left unanswered for
          seven days expires on its own.
        </p>
      </div>

      {sent === '1' && <p className="l-note">Sent. {partnerName} can approve it now.</p>}

      <section className="l-stack">
        <span className="l-label">Waiting for you</span>
        {waitingOnMe.length === 0 ? (
          <div className="l-empty">
            <p>Nothing needs your approval right now.</p>
          </div>
        ) : (
          waitingOnMe.map((proposal, index) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              taskTitle={proposal.task_id ? titleById.get(proposal.task_id) ?? null : null}
              proposerName={partnerName}
              mine={false}
              position={`${index + 1} of ${waitingOnMe.length}`}
            />
          ))
        )}
      </section>

      <section className="l-stack">
        <span className="l-label">Waiting for {partnerName}</span>
        {waitingOnPartner.length === 0 ? (
          <div className="l-empty">
            <p>You have nothing out for approval.</p>
          </div>
        ) : (
          waitingOnPartner.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              taskTitle={proposal.task_id ? titleById.get(proposal.task_id) ?? null : null}
              proposerName={partnerName}
              mine
            />
          ))
        )}
      </section>

      {settled.length > 0 && (
        <section className="l-stack-tight">
          <span className="l-label">Settled</span>
          <ul className="l-list">
            {settled.map((proposal) => (
              <li key={proposal.id} className="l-task" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <span className="l-task-body">
                  {proposal.payload.title ??
                    (proposal.task_id ? titleById.get(proposal.task_id) : null) ??
                    (proposal.kind === 'day_end' ? 'End-of-day time' : 'A task')}
                </span>
                <span className="l-chip">{PROPOSAL_STATUS_LABELS[effectiveStatus(proposal)]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
