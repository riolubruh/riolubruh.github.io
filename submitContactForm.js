const contactForm = document.getElementById("contactForm");
contactForm.addEventListener("submit", async function(e){
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
            alert("Too many requests! Please wait 5 minutes between messages!");
        }else {
            alert("An error occurred.");
        }
    }).catch(err => {
        alert("An error occurred.");
    });

});