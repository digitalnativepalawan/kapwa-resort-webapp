import ServiceHeader from '@/components/service/ServiceHeader';
import CashierBoard from '@/components/service/CashierBoard';

const ServiceCashierPage = () => (
  <div className="min-h-screen flex flex-col bg-navy-texture">
    <ServiceHeader department="cashier" />
    <div className="flex-1 overflow-y-auto">
      <div className="pb-20">
        <CashierBoard />
      </div>
    </div>
  </div>
);

export default ServiceCashierPage;
