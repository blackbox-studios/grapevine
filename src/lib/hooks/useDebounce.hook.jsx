import { useState, useEffect } from "react";

const useDebounce = (value, delay, initial = value) => {
    const [debounced, setDebounced] = useState(initial);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebounced(value);
        }, delay);
        return () => clearTimeout(timeout);
    }, [value, delay]);

    return debounced;
};

export const useDelay = (flag, delayMs = 150) =>
    useDebounce(flag, delayMs, false) && flag;

export default useDebounce;
