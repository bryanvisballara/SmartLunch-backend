import './ClickableOptionPicker.css';

export default function ClickableOptionPicker({ label, options = [], selectedValues = [], emptyLabel, onAdd, onRemove }) {
  const selectedSet = new Set((selectedValues || []).map((value) => String(value)));
  const selectedOptions = (options || []).filter((option) => selectedSet.has(String(option.value)));
  const coveredCourseIds = new Set(
    selectedOptions
      .filter((option) => option.kind === 'classroom_group')
      .flatMap((option) => (Array.isArray(option.courseIds) ? option.courseIds : []).map(String))
  );
  const availableOptions = (options || []).filter((option) => {
    if (selectedSet.has(String(option.value))) {
      return false;
    }
    const courseIds = (Array.isArray(option.courseIds) ? option.courseIds : []).map(String);
    if (option.kind === 'course' && courseIds.length > 0 && courseIds.every((courseId) => coveredCourseIds.has(courseId))) {
      return false;
    }
    return true;
  });
  const groupOptions = availableOptions.filter((option) => option.kind === 'classroom_group');
  const otherOptions = availableOptions.filter((option) => option.kind !== 'classroom_group');
  const sections = groupOptions.length > 0
    ? [
      { heading: 'Grupos de grados', items: groupOptions },
      { heading: 'Grados y cursos', items: otherOptions },
    ].filter((section) => section.items.length > 0)
    : [{ heading: '', items: otherOptions }];

  return (
    <div className="audience-picker rectoria-selection-group">
      {label ? <div className="audience-picker__label rectoria-selection-label">{label}</div> : null}
      <div className="audience-picker__list rectoria-option-list" role="listbox" aria-label={label}>
        {availableOptions.length === 0 ? (
          <p className="audience-picker__empty rectoria-option-list-empty">No hay más opciones disponibles.</p>
        ) : sections.map((section) => (
          <div key={section.heading || 'options'}>
            {section.heading ? <p className="audience-picker__heading">{section.heading}</p> : null}
            {section.items.map((option) => (
              <button
                className="audience-picker__item rectoria-option-item"
                key={String(option.value)}
                onClick={() => onAdd(String(option.value))}
                type="button"
              >
                <span>{option.label}</span>
                <em>Toca para agregar</em>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="audience-picker__selected rectoria-selected-list">
        {(selectedValues || []).length === 0 ? <p className="audience-picker__empty rectoria-option-list-empty">{emptyLabel}</p> : null}
        {(selectedValues || []).map((value) => {
          const option = (options || []).find((item) => String(item.value) === String(value));
          return (
            <button className="audience-picker__chip rectoria-selected-chip" key={String(value)} onClick={() => onRemove(String(value))} type="button">
              {option?.label || value}
              <span>x</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
