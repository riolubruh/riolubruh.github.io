function closeImageWrapper(){
    let imageWrapper = document.getElementById("imageWrapper");
    imageWrapper.style.opacity = "0%";
    setTimeout(() => {
        imageWrapper.style.display = "none";
        imageWrapper.style.visibility = "hidden";
    }, 300);
}

function openImageWrapper(imageSrc){
    document.getElementById("imageWrapperImage").src = imageSrc;
    let imageWrapper = document.getElementById("imageWrapper");
    imageWrapper.style.display = "flex";
    imageWrapper.style.visibility = "visible";
    setTimeout(() => { 
        // you have to separate the setting of the display/visibility and the opacity
        // because for some reason if the opacity and display/visibility is set at the
        // same time the css transition doesnt work lol
        imageWrapper.style.opacity = "100%";
    }, 1);
}