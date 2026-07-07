import ServiceBoard from '@/components/service/ServiceBoard';
import ServiceHeader from '@/components/service/ServiceHeader';

const ServiceBarPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture overflow-hidden">
    <ServiceHeader department="bar" />
    <ServiceBoard department="bar" />
  </div>
);

export default ServiceBarPage;
