var paypal = require('paypal-rest-sdk');

paypal.configure({
  'mode': 'sandbox', //sandbox or live
  'client_id': 'AYJxKHVYEaAC7aQ4dpsCcPb0QvwqfXJoSkLc5k10OCKnuP0Dbdmbd8bHfVP09o-x8mM0FJGmduPzTHCt',
  'client_secret': 'EOoFjOoBI9KLtRVEqHs5wET58oWINWlLXw0xqOFyp1iFuNHOlGV-tcJaXtqSlzfTopd-Gp9ghGesdxNE'
});

var card_data = {
  "type": "visa",
  "number": "4417119669820331",
  "expire_month": "11",
  "expire_year": "2018",
  "cvv2": "123",
  "first_name": "Joe",
  "last_name": "Shopper"
};

paypal.creditCard.create(card_data, function(error, credit_card){
  if (error) {
    console.log(error);
    throw error;
  } else {
    console.log("Create Credit-Card Response");
    console.log(credit_card);
  }
})