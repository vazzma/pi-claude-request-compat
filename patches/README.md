# Historical Pi host integration

`pi-host.patch` records the earlier experimental middleware hook for Pi at
commit `7fd564cbb78f35f3de14d5382fea692b87ec4026`. Attribution is in `NOTICE`.

The current extension registers a dedicated `claude-compat` provider through
stock Pi's provider API. It does not register the patched host middleware hook,
and this patch is not required for installation or included in the npm package.

Retained as development history, not as a supported installation route. It is
not checked against current Pi releases. Do not apply it to an arbitrary Pi
checkout or restore the old routing without reviewing authentication, dispatch,
and missing-provider behaviour and adding host integration coverage.
