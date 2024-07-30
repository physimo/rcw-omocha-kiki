
function modifyDOM() {
    const elements = document.querySelectorAll('.rcx-sidebar-footer');
    elements.forEach(el => el.remove());


    //Channel Title Names
    var channelNames = document.querySelectorAll('.rcx-sidebar-item__title');
    for (let n = 0; n < channelNames.length; n++) {
        if (channelNames[n].innerHTML.charAt(0) == "0") {
            channelNames[n].innerHTML = channelNames[n].innerHTML.substring(3);
        }
    }

    // make divider channel unclickable
    var dividerChannels = document.querySelectorAll('a.rcx-sidebar-item');
    for (let n = 0; n < dividerChannels.length; n++) {
        if (dividerChannels[n].innerHTML.charAt(dividerChannels[n].innerHTML.length - 1) == "-") {
            dividerChannels[n].style = "cursor: default;"
            dividerChannels[n].classList.remove("rcx-sidebar-item--clickable")
            if (dividerChannels[n].tagName === "A") dividerChannels[n].removeAttribute("href")
        }
    }
}



window.addEventListener('DOMContentLoaded', () => {
    // Create a MutationObserver to watch for changes in the DOM
    const observer = new MutationObserver(() => {
        modifyDOM();
    });

    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });

    // Optionally, remove existing elements on initial load
    modifyDOM();
});
