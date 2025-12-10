# 🔧 תיקון: החלפת המודאל הפשוט במודאל המפורט

## הבעיה:
המערכת משתמשת ב-`SimulateFixModal.tsx` (פשוט, 317 שורות)
אבל צריך להשתמש ב-`simulate-fix-modal.tsx` (מפורט, 787 שורות)

## הפתרון:
1. למצוא איפה משתמשים ב-`SimulateFixModal`
2. להחליף אותו ב-`simulate-fix-modal`
3. לוודא שה-props תואמים

## קבצים שצריך לעדכן:
- components/system-detail-dashboard.tsx
- components/issues/security-findings-list.tsx
- components/system-health-section.tsx

