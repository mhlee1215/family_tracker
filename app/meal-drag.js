export function wireMealDragHandle({ row, dragHandle, mealId }) {
  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', mealId);
    document.body.classList.add('meal-dragging');
    row.classList.add('dragging');
  };

  const handleDragEnd = () => {
    row.draggable = false;
    document.body.classList.remove('meal-dragging');
    row.classList.remove('dragging');
    document.querySelectorAll('.task-list.drag-target').forEach((node) => node.classList.remove('drag-target'));
  };

  dragHandle.onpointerdown = () => {
    row.draggable = true;
  };

  row.ondragstart = handleDragStart;
  row.ondragend = handleDragEnd;
}
