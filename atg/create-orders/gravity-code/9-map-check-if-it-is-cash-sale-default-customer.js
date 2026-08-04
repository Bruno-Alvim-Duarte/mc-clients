const iterationLoop = input['iterateELDR'][0];
const envVariables = input['workflowArguments'];

let defaultCustomerId

if(envVariables.recordType === 'cashsale' && iterationLoop.customer == null){
    defaultCustomerId = '556024'
}

return [{
    defaultCustomerId,
}]