import DepartmentOrdersView from '@/components/DepartmentOrdersView';

/**
 * Kitchen home — wraps DepartmentOrdersView for kitchen department.
 */
const KitchenHome = () => {
  return <DepartmentOrdersView department="kitchen" embedded />;
};

export default KitchenHome;
