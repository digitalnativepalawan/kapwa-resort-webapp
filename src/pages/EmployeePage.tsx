import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const EmployeePage = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate('/employee-portal', { replace: true }); }, [navigate]);
  return null;
};

export default EmployeePage;
