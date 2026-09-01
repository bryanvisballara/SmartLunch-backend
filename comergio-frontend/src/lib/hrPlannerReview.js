export function createPlannerReturnDraft(requestId = '') {
  return {
    requestId: String(requestId || ''),
    generalObservation: '',
    rowNotes: {},
  };
}

function buildActivityMaterials(activity = {}) {
  const materials = Array.isArray(activity.materials) && activity.materials.length
    ? activity.materials
    : [{
      materialName: activity.materialName,
      quantity: activity.quantity,
    }];

  return materials
    .map((material, materialIndex) => {
      const needed = String(material.materialName || activity.materialName || 'Material').trim() || 'Material';
      const quantity = Number(material.quantity || activity.quantity || 1) || 1;
      return {
        key: `${materialIndex}-${needed}`,
        needed,
        quantity,
      };
    })
    .filter((material) => material.needed);
}

export function getPlannerRequestReviewRows(request) {
  const activities = Array.isArray(request?.plannerActivities) ? request.plannerActivities : [];
  const items = Array.isArray(request?.items) ? request.items : [];

  if (request?.noMaterialsNeeded) {
    return [{
      key: 'no-materials',
      activityTitle: '',
      purpose: request.purpose || 'No necesita material para este periodo.',
      context: request.requestedForArea || '',
      materials: [{ key: 'none', needed: 'Sin materiales', quantity: '' }],
      needed: 'Sin materiales',
      quantity: '',
    }];
  }

  if (activities.length) {
    return activities.map((activity, activityIndex) => {
      const materials = buildActivityMaterials(activity);
      const purpose = String(activity.purpose || activity.description || request.purpose || '').trim();
      const activityTitle = String(activity.title || '').trim();
      const context = activity.isEvent
        ? 'Evento institucional'
        : (
          [activity.grade, ...(Array.isArray(activity.grades) ? activity.grades : []), activity.courseLabel]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index)
            .join(' · ')
        );

      return {
        key: String(activity.id || `activity-${activityIndex}`),
        activityTitle,
        purpose,
        context,
        materials,
        needed: materials.map((material) => material.needed).join(', '),
        quantity: materials.reduce((sum, material) => sum + Number(material.quantity || 0), 0),
      };
    });
  }

  if (!items.length) {
    return [{
      key: 'empty',
      activityTitle: '',
      purpose: request?.purpose || '',
      context: request?.requestedForArea || '',
      materials: [{ key: 'empty', needed: 'Sin materiales registrados', quantity: '' }],
      needed: 'Sin materiales registrados',
      quantity: '',
    }];
  }

  return [{
    key: 'items-group',
    activityTitle: '',
    purpose: String(request?.purpose || '').trim(),
    context: request?.requestedForArea || '',
    materials: items.map((entry, index) => ({
      key: String(entry.id || `item-${index}`),
      needed: String(entry.item?.name || entry.customName || 'Material').trim() || 'Material',
      quantity: Number(entry.quantity || 1) || 1,
    })),
    needed: items.map((entry) => entry.item?.name || entry.customName || 'Material').join(', '),
    quantity: items.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
  }];
}

export function buildPlannerReturnObservation(draft, rows = []) {
  const parts = [];
  const general = String(draft?.generalObservation || '').trim();
  if (general) {
    parts.push(general);
  }

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const note = String(draft?.rowNotes?.[row.key] || '').trim();
    if (!note) {
      return;
    }

    const activityLabel = row.activityTitle
      || (Array.isArray(row.materials) && row.materials.length
        ? row.materials.map((material) => [
          material.needed,
          material.quantity ? `x${material.quantity}` : '',
        ].filter(Boolean).join(' ')).join(', ')
        : (row.needed || 'Actividad'));
    parts.push(`• ${activityLabel}: ${note}`);
  });

  return parts.join('\n').trim();
}

export function getPlannerReturnObservationLength(draft, rows = []) {
  return buildPlannerReturnObservation(draft, rows).length;
}
