const contactForm = document.getElementById("contactForm");
contactForm.addEventListener("submit", async function(e){
    //****PLEASE NOTE THAT THIS IS A REAL CONTACT FORM.****
    // This form will literally send a message to me in a private Discord channel through a webhook.
    // It does has a rate limit so an IP address can only send 1 message in a given amount of time.
    const sendMessageUrl = `https://forwardmessages.riolubruh.workers.dev`;
    e.preventDefault();
    let name = contactForm.name.value;
    let email = contactForm.email.value;
    let subject = contactForm.subject.value;
    let body = contactForm.body.value;

    const options = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({name, email, subject, body})
    }
    await fetch(sendMessageUrl, options).then(res => {
        if(res.ok){
            alert("Message sent!")
        }else if(res.status == 429){
            alert("Too many requests! Please wait 1 minute between messages!");
        }else {
            alert("An error occurred.");
        }
    }).catch(err => {
        alert("An error occurred.");
    });

});