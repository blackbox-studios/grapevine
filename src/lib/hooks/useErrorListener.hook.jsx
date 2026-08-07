import { useEffect } from "react";
import { toast } from "sonner";

import { useErrors } from "@/lib/store/global.hook";

/* Sends toast notifications and console logs when something goes wrong */
/* Can do other cool stuff here too like send to telemetry */
const useErrorListener = () => {
    const { errors, clearErrors } = useErrors()

    useEffect(() => {
        /* Recursively display errors to the user */
        const processError = (value) => {
            if (value === false || value == null) {
                return;
            }
            if (typeof value === 'string') {
                console.error(value);
                toast.error(value, { duration: 6000 });
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(item => {
                    if (item && typeof item === 'string') {
                        console.error(item);
                        toast.error(item, { duration: 6000 });
                    }
                });
                return;
            }
            if (typeof value === 'object') {
                Object.values(value).forEach(processError);
            }
        };

        processError(errors);
        /* NOTE: Careful messing around here because this can lead to an infinite
        * render state as it is modifying it's own listener (errors object) */
        clearErrors();
    }, [errors, clearErrors])
}

export default useErrorListener
