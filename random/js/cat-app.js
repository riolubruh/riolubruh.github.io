$(document).ready(function() {

	var shibeContainer = $('#shibeContainer');

	// Get new shibe button click event
	var btnGetNew = $("#btnGetNew");
	btnGetNew.click(getNewShibe);

	function getNewShibe(e){
		var loadingText = 'Loading...';
		shibeContainer.html(loadingText);

		var corsAnywhere = 'https://cors-anywhere.riolubruh.repl.co/';
		var apiUrl = 'tidy-living-complaint.herokuapp.com:443/lesson/shibe.online/api/cats?count=1';

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
		//console.log(response[0]);
		var imageUrl = response[0];
		imageUrl = "https://tidy-living-complaint.herokuapp.com/lesson/" + imageUrl;
		var shibeImg = '<img id="shibePhoto" src="' + imageUrl + '" class="img-fluid">';
		shibeContainer.html(shibeImg);
	}

	function handleError(err) {
		console.log("SOMETHING WENT WRONG - ERROR");
	}

})