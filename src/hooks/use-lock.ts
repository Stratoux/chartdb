import { useContext } from 'react';
import { lockContext } from '@/context/lock-context/lock-context';

export const useLock = () => useContext(lockContext);
