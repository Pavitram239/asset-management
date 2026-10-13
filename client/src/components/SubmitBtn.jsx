import { useNavigation } from 'react-router-dom';

const SubmitBtn = ({ formBtn, text = 'Submit', waitingLabel = 'Saving', className = '' }) => {
  const navigation = useNavigation();
  const pending = navigation.state === 'submitting';
  return <button type="submit" className={`btn ${formBtn ? 'form-btn' : ''} ${className}`} disabled={pending}>
    {pending ? `${waitingLabel}…` : text}
  </button>;
};
export default SubmitBtn;
