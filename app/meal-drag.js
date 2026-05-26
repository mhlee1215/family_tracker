const mealDropCleanupByDocument = new WeakMap();

function registerMealDropCleanup(documentRef, cleanup) {
  let registry = mealDropCleanupByDocument.get(documentRef);
  if (!registry) {
    registry = { cleanups: new Set() };
    registry.onDrop = () => {
      registry.cleanups.forEach((fn) => fn());
    };
    documentRef.addEventListener('drop', registry.onDrop);
    mealDropCleanupByDocument.set(documentRef, registry);
  }
  registry.cleanups.add(cleanup);
}

export function wireMealDragHandle({ row, dragHandle, mealId }) {
  let dragArmed = false;
  let dragging = false;

  const cleanupDragState = () => {
    dragArmed = false;
    dragging = false;
    row.draggable = false;
    document.body.classList.remove('meal-dragging');
    row.classList.remove('dragging');
    document.querySelectorAll('.task-list.drag-target').forEach((node) => node.classList.remove('drag-target'));
  };

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
    dragging = true;
    document.body.classList.add('meal-dragging');
    row.classList.add('dragging');
  };

  const handleDragEnd = () => cleanupDragState();

  const handleGlobalDrop = () => {
    if (dragging) cleanupDragState();
  };

  dragHandle.onpointerdown = armDrag;
  dragHandle.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') armDrag();
  };

  row.ondragstart = handleDragStart;
  row.ondragend = handleDragEnd;
  registerMealDropCleanup(document, handleGlobalDrop);
}
