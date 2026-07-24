import { useEffect, useRef, useState } from 'react';
import {
  RECTORIA_PORTAL_NAV,
} from './rectoriaPortalNav';
import TeEscuchamosLabel from '../community/TeEscuchamosLabel';
import { StaffAnnouncementsUnreadBadge } from '../staff-announcements/StaffAnnouncementsPanel';
import './RectoriaPortalSidebar.css';

const NESTED_CHILD_KEYS = new Set(['team', 'students', 'admissions']);

const COORDINATION_NAV = [
  { type: 'item', key: 'overview', label: 'Tablero de nivel' },
  { type: 'item', key: 'community_reports', label: 'Te escuchamos' },
  { type: 'item', key: 'communications', label: 'Comunicados a familias' },
  { type: 'item', key: 'staff_announcements', label: 'Comunicados internos' },
  { type: 'item', key: 'resources', label: 'Recursos y compras' },
  { type: 'item', key: 'schedule', label: 'Horario académico' },
];

function ChevronIcon({ expanded }) {
  return (
    <svg aria-hidden="true" className="rectoria-rail__chevron" fill="none" viewBox="0 0 24 24">
      <path
        d={expanded ? 'M6 15l6-6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function RectoriaNavCountBadge({ count = 0, label = 'notificaciones pendientes' }) {
  const safeCount = Number(count || 0);
  if (safeCount <= 0) return null;
  return (
    <span aria-label={`${safeCount} ${label}`} className="rectoria-rail__badge">
      {safeCount > 99 ? '99+' : safeCount}
    </span>
  );
}

function resolveGroupBadgeCount(groupKey, counts = {}) {
  if (groupKey === 'administrative') {
    return Number(counts.matriculaAuthorizations || 0);
  }
  if (groupKey === 'institutional_config') {
    return Number(counts.studentsMissingPlacement || 0);
  }
  if (groupKey === 'control_center') {
    return Number(counts.communityReports || 0);
  }
  return 0;
}

function resolveItemBadgeCount(itemKey, counts = {}) {
  if (itemKey === 'matricula_authorizations') {
    return Number(counts.matriculaAuthorizations || 0);
  }
  if (itemKey === 'students') {
    return Number(counts.studentsMissingPlacement || 0);
  }
  if (itemKey === 'control_community_reports' || itemKey === 'community_reports') {
    return Number(counts.communityReports || 0);
  }
  return 0;
}

export default function RectoriaPortalSidebar({
  activeSection,
  expandedGroup,
  isCoordinationPortal = false,
  matriculaAuthorizationPendingCount = 0,
  studentsMissingPlacementCount = 0,
  communityReportsPendingCount = 0,
  staffAnnouncementsUnreadCount = 0,
  onSectionChange,
  onExpandedGroupChange,
  teamSubnav = null,
  admissionsSubnav = null,
  academicManagementSubnav = null,
}) {
  const nav = isCoordinationPortal ? COORDINATION_NAV : RECTORIA_PORTAL_NAV;
  const [expandedNestedSection, setExpandedNestedSection] = useState('');
  const previousActiveSectionRef = useRef(activeSection);
  const badgeCounts = {
    matriculaAuthorizations: matriculaAuthorizationPendingCount,
    studentsMissingPlacement: studentsMissingPlacementCount,
    communityReports: communityReportsPendingCount,
  };

  useEffect(() => {
    if (activeSection === previousActiveSectionRef.current) {
      return;
    }

    previousActiveSectionRef.current = activeSection;

    if (NESTED_CHILD_KEYS.has(activeSection)) {
      setExpandedNestedSection(activeSection);
      return;
    }

    setExpandedNestedSection('');
  }, [activeSection]);

  const itemHasNestedSubnav = (groupKey, itemKey) => {
    if (groupKey === 'institutional_config' && (itemKey === 'team' || itemKey === 'students')) {
      return true;
    }

    if (groupKey === 'administrative' && itemKey === 'admissions') {
      return true;
    }

    return false;
  };

  const resolveNestedSubnavContent = (groupKey, itemKey) => {
    if (groupKey === 'institutional_config' && itemKey === 'team') {
      return teamSubnav;
    }

    if (groupKey === 'institutional_config' && itemKey === 'students') {
      return academicManagementSubnav;
    }

    if (groupKey === 'administrative' && itemKey === 'admissions') {
      return admissionsSubnav;
    }

    return null;
  };

  const handleItemClick = (sectionKey, groupKey = '') => {
    onSectionChange(sectionKey);
    if (groupKey) {
      onExpandedGroupChange(groupKey);
    }
    if (!itemHasNestedSubnav(groupKey, sectionKey)) {
      setExpandedNestedSection('');
    }
  };

  const handleChildClick = (itemKey, groupKey) => {
    if (groupKey) {
      onExpandedGroupChange(groupKey);
    }

    if (itemHasNestedSubnav(groupKey, itemKey)) {
      if (activeSection === itemKey && expandedNestedSection === itemKey) {
        setExpandedNestedSection('');
        return;
      }

      onSectionChange(itemKey);
      setExpandedNestedSection(itemKey);
      return;
    }

    onSectionChange(itemKey);
    setExpandedNestedSection('');
  };

  const handleGroupToggle = (groupKey, items = []) => {
    if (expandedGroup === groupKey) {
      onExpandedGroupChange('');
      return;
    }

    onExpandedGroupChange(groupKey);

    const hasActiveChild = items.some((item) => item.key === activeSection);
    const firstItemKey = items[0]?.key || '';
    if (firstItemKey && !hasActiveChild) {
      onSectionChange(firstItemKey);
    }
  };

  return (
    <aside className="rectoria-rail" aria-label={isCoordinationPortal ? 'Navegación de coordinación' : 'Navegación de rectoría'}>
      <nav className="rectoria-rail__nav">
        {nav.map((entry) => {
          if (entry.type === 'item') {
            const isActive = activeSection === entry.key;
            const itemBadgeCount = resolveItemBadgeCount(entry.key, badgeCounts);
            return (
              <button
                className={`rectoria-rail__item${isActive ? ' is-active' : ''}`}
                key={entry.key}
                onClick={() => handleItemClick(entry.key)}
                type="button"
              >
                <span className="rectoria-rail__item-label">
                  {entry.key === 'community_reports' ? <TeEscuchamosLabel className="te-escuchamos-label--nav" /> : entry.label}
                  {entry.key === 'staff_announcements' ? (
                    <StaffAnnouncementsUnreadBadge count={staffAnnouncementsUnreadCount} />
                  ) : (
                    <RectoriaNavCountBadge count={itemBadgeCount} />
                  )}
                </span>
              </button>
            );
          }

          const isGroupOpen = expandedGroup === entry.key;
          const hasActiveChild = (entry.items || []).some((item) => item.key === activeSection);
          const groupBadgeCount = resolveGroupBadgeCount(entry.key, badgeCounts);

          return (
            <div className={`rectoria-rail__group${isGroupOpen ? ' is-open' : ''}${hasActiveChild ? ' has-active-child' : ''}`} key={entry.key}>
              <button
                aria-expanded={isGroupOpen}
                className={`rectoria-rail__group-toggle${hasActiveChild ? ' is-active' : ''}`}
                onClick={() => handleGroupToggle(entry.key, entry.items || [])}
                type="button"
              >
                <span className="rectoria-rail__item-label">
                  {entry.label}
                  <RectoriaNavCountBadge count={groupBadgeCount} />
                </span>
                <ChevronIcon expanded={isGroupOpen} />
              </button>

              {isGroupOpen ? (
                <div className="rectoria-rail__children">
                  {(entry.items || []).map((item) => {
                    const isActive = activeSection === item.key;
                    const itemBadgeCount = resolveItemBadgeCount(item.key, badgeCounts);
                    const hasNestedSubnav = itemHasNestedSubnav(entry.key, item.key);
                    const nestedSubnav = hasNestedSubnav ? resolveNestedSubnavContent(entry.key, item.key) : null;
                    const isNestedOpen = isActive && expandedNestedSection === item.key && Boolean(nestedSubnav);

                    return (
                      <div className={`rectoria-rail__child-block${hasNestedSubnav ? ' has-nested' : ''}`} key={item.key}>
                        <button
                          aria-expanded={hasNestedSubnav ? isNestedOpen : undefined}
                          className={`rectoria-rail__child${isActive ? ' is-active' : ''}${hasNestedSubnav ? ' rectoria-rail__child--expandable' : ''}`}
                          onClick={() => handleChildClick(item.key, entry.key)}
                          type="button"
                        >
                          <span className="rectoria-rail__child-label">
                            {item.key === 'control_community_reports' ? <TeEscuchamosLabel className="te-escuchamos-label--nav" /> : item.label}
                            <RectoriaNavCountBadge count={itemBadgeCount} />
                          </span>
                          {hasNestedSubnav ? <ChevronIcon expanded={isNestedOpen} /> : null}
                        </button>
                        {isNestedOpen ? (
                          <div className="rectoria-rail__nested">{nestedSubnav}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
