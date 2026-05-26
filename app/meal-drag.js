export function wireMealDragHandle({ row, dragHandle, mealId }) {
  let dragArmed = false;

  const armDrag = () => {
    dragArmed = true;
    row.draggable = true;
  };

  const handleDragStart = (event) => {
    if (!dragArmed) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', mealId);
    document.body.classList.add('meal-dragging');
    row.classList.add('dragging');
  };

  const handleDragEnd = () => {
    dragArmed = false;
    row.draggable = false;
    document.body.classList.remove('meal-dragging');
    row.classList.remove('dragging');
    document.querySelectorAll('.task-list.drag-target').forEach((node) => node.classList.remove('drag-target'));
  };

  dragHandle.onpointerdown = armDrag;
  dragHandle.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') armDrag();
  };

  row.ondragstart = handleDragStart;
  row.ondragend = handleDragEnd;
}
