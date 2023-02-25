$(document).ready(function() {

	var shibeContainer = $('#shibeContainer');

	// Get new shibe button click event
	var btnGetNew = $("#btnGetNew");
	btnGetNew.click(getNewShibe);

	function getNewShibe(e){
		let loadingText = 'Loading...';
		shibeContainer.html(loadingText);

		let corsAnywhere = 'https://cors-anywhere.riolubruh.repl.co/';
		let apiUrl = 'shibe.online/api/shibes?count=1';

		fetch(corsAnywhere + apiUrl)
		.then(response => {
		  return response.json();
		}).then(data => {
		  handleCheckSuccess(data);
		}).catch(err => {
		  handleError(err);
		});
	}

	function handleCheckSuccess(response) {
		var imageUrl = response[0];
		var shibeImg = '<img id="shibePhoto" src="' + imageUrl + '" class="img-fluid">';
		shibeContainer.html(shibeImg);
	}

	function handleError(err) {
		console.log("SOMETHING WENT WRONG - ERROR");
	}

})