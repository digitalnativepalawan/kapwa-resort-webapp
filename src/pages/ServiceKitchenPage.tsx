import ServiceBoard from '@/components/service/ServiceBoard';
import ServiceHeader from '@/components/service/ServiceHeader';

const ServiceKitchenPage = () => (
  <div className="h-screen flex flex-col bg-navy-texture overflow-hidden">
    <ServiceHeader department="kitchen" />
    <ServiceBoard department="kitchen" />
  </div>
);

export default ServiceKitchenPage;
