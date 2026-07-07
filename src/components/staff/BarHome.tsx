import DepartmentOrdersView from '@/components/DepartmentOrdersView';

/**
 * Bar home — wraps DepartmentOrdersView for bar department.
 */
const BarHome = () => {
  return <DepartmentOrdersView department="bar" embedded />;
};

export default BarHome;
