import { redirect } from 'next/navigation';
import { TaskForm } from '@/components/TaskForm';
import { proposeTaskAction } from '@/lib/actions';
import { getCoupleContext, getSession, isLinked } from '@/lib/data';

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const partnerName = context.partner?.display_name ?? 'Your partner';

  return (
    <>
      <div className="l-stack-tight">
        <h1>New task</h1>
        <p className="l-muted">
          {partnerName} sees this as a suggestion and approves it before it joins your list.
        </p>
      </div>
      <div className="l-panel">
        <TaskForm
          action={proposeTaskAction}
          submitLabel={`Send to ${partnerName}`}
          today={context.today}
          partnerName={partnerName}
        />
      </div>
    </>
  );
}
