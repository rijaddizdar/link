import { notFound, redirect } from 'next/navigation';
import { TaskForm } from '@/components/TaskForm';
import { proposeTaskEditAction } from '@/lib/actions';
import { getCoupleContext, getSession, getTasks, isLinked } from '@/lib/data';

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const context = await getCoupleContext(session);
  if (!isLinked(context) || !context) redirect('/link');

  const { id } = await params;
  const task = (await getTasks()).find((candidate) => candidate.id === id);
  if (!task) notFound();

  const partnerName = context.partner?.display_name ?? 'Your partner';

  return (
    <>
      <div className="l-stack-tight">
        <h1>Propose a change</h1>
        <p className="l-muted">{partnerName} approves the change before it takes effect.</p>
      </div>
      <div className="l-panel">
        <TaskForm
          action={proposeTaskEditAction}
          taskId={task.id}
          initial={task}
          submitLabel="Send the change"
          today={context.activeDate}
          partnerName={partnerName}
        />
      </div>
    </>
  );
}
