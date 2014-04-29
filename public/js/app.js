/***********************************************************************
 *
 *   Global variables
 *
 ***********************************************************************/

Parse.$ = jQuery;
var autocomplete, map, geocoder,router;
var nearbyMiles = 100;

/************************************************************
 *
 *  Share Your Travel Plans!
 *
 ************************************************************/

//EnterPlanView

var EditPlanView = Parse.View.extend({
	events: {
		"submit form.share-plan-form": "submit"
	},
	el: "#modal",
	template: _.template($('#share-plan-template').html()),
	render: function(plan) {
		console.log(plan);
		if(typeof plan === "string"){
			this.loadPlan(plan);
			return;
		}
		this.plan = plan || {};
		console.log('Rendering a EditPlanView...');
		this.$el.html(this.template({user:Parse.User.current(),plan:this.plan}));
		autocompleteInitialize();
		this.$el.modal('show');
		this.$el.on('hidden.bs.modal', function () {
			router.navigate('',{trigger:true});
		});
	},
	loadPlan:function(id){
		var that = this;
		var q = new Parse.Query("TravelPlan");
		q.include("markerParent");
		q.get(id,{
			success:function(plan){
				console.log(plan.get("markerParent").id);
				console.log(plan.get("markerParent").get("location"));
				that.render(plan);
			}
		});
	},
	submit: function() {
		var that = this;
		var location = this.$("#inputLocation").val();
		var id;
		if(this.$('#inputID')){
			id = this.$('#inputID').val();
		}
		if (!location) {
			$('#plan-submit-btn').button('reset');
			this.$("#plan-error").html("Please complete every field").show();
			console.log("Please complete every field");
			return false;
		} else {
			this.$('#plan-submit-btn').html('<div class="spinner-sm"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div>').attr('disabled','disabled');
			getCurrentUser(function(user) {
				geocoder.geocode( { 'address': location}, function(results, status) {
					if (status == google.maps.GeocoderStatus.OK) {
						var TravelPlan = Parse.Object.extend("TravelPlan");
						var sp = new TravelPlan();
						if(id){sp.id = id;}
						sp.set("parent", user);
						sp.set("location", location);
						var point = new Parse.GeoPoint({latitude: results[0].geometry.location.k, longitude: results[0].geometry.location.A});
						sp.set("geoLocation", point);
						sp.save(null, {
							success: function(sp) {
								console.log("The new travel plan is succeessfully saved!");
								$('#plan-submit-btn').button('reset');
								$("#modal").modal('hide');
								initializeMarkers(); // If it's a new marker, then will show right after save
								map.setZoom(10);
								map.setCenter(new google.maps.LatLng(results[0].geometry.location.k, results[0].geometry.location.A));
							},
							error: function(sp, error) {
								console.log("Error: " + error.code + " " + error.message);
								$('#plan-submit-btn').button('reset');
							}
						});
					}
				});
			});
			return false;
		}
	}
});

// LoginView

var LoginView = Parse.View.extend({
	events: {
		"click #login": "login"
	},
	el: "#modal",
	template: _.template($('#login-template').html()),
	initialize: function() {
	},
	render: function(afterLogin) {
		this.afterLogin = afterLogin || "plan/new";
		this.$el.html(this.template());
		this.$el.modal('show');
		this.$el.on('hidden.bs.modal', function () {
			router.navigate('',{trigger:true});
		});
	},
	login: function() {
		$('#login').button('loading');
		var that = this;
		Parse.FacebookUtils.logIn("email", {
			success: function(user) {
				if (!user.existed()) {
					getFacebookId(function(id) {
						FB.api(id, {fields: 'email, first_name, last_name, picture.height(160)'}, function(response) {
							user.set("facebookID", response.id);
							user.set("email", response.email);
							user.set("firstName", response.first_name);
							user.set("lastName", response.last_name);
							user.set("imgURL", response.picture.data.url);
							user.save(null, {
								success: function(user) {
									console.log("User signed up and logged in through Facebook!");
									$('#login').button('reset');
									menuView.render();
									router.navigate(that.afterLogin,{trigger:true});
								},
								error: function(user, error) {
									$('#login').button('reset');
									console.log("error: " + error.code + error.meesage);
								}
							});
						});
					});
				} else {
					console.log("User logged in through Facebook!");
					$('#login').button('reset');
					menuView.render();
					router.navigate(that.afterLogin,{trigger:true});
				}
			},
			error: function(user, error) {
				$('#login').button('reset');
				console.log("error: " + error.code + error.meesage);
				alert("User cancelled the Facebook login or did not fully authorize. error code:" + error.code + " error message: " + error.message);
			}
		});
	}
});

/************************************************************
 *
 *  The Nav Bar Account Menu -- a profile pic after signed in
 *
 ************************************************************/

var NavBarMenuView = Parse.View.extend({
	el:"#my-account-btn-div",
	template: _.template($("#nav-bar-menu-template").html()),
	initialize: function() {
	},
	render: function() {
		this.$el.html(this.template({user:Parse.User.current()}));
		getLocation(function(point) {
			getCurrentUser(function(user) {
				user.set("location", point);
				user.save(null, {
					success: function(user) {
						console.log("location updated successfully");
					},
					error: function(user, error) {
						console.log("error: " + error.code + error.meesage);
					}
				});
			});
		});
	}
});

/************************************************************
 *
 *  Find Travel Buddies on Map -- Controlling behavior after
 *  you click on any markers on map
 *
 ************************************************************/

// A single travel plan object

var Plan = Parse.Object.extend("TravelPlan");

// A Travel Plan Collection

var PlanCollection = Parse.Collection.extend({
	model: Plan,
});

// A Single Plan View
var PlanView = Parse.View.extend({
	tagName:'div',
	template: _.template($('#plan-template').html()),
	render:function(){
		this.$el.html(this.template({plan:this.model}));
		return this;
	}
});

// A Collection of Plans View
var PlanCollectionView = Parse.View.extend({
	tagName: 'div',
	template: _.template($("#plan-list-template").html()),
	el:"#modal",
	collection:new PlanCollection(),
	render: function(location_id) {
		modalLoadingView.render();
		var MM = Parse.Object.extend("MapMarker");
		var mm = new MM();
		mm.id = location_id;
		this.collection.query = (new Parse.Query(Plan)).include("parent").equalTo("markerParent",mm).include("markerParent");
		var that = this; //scope is lost inside the collection.fetch
		this.collection.fetch().done(function(plans){ //fetch the collection (PlanCollection)
			var title = "Find Neighbors";
			var id;
			if(plans.models.length){
				title = plans.models[0].get("markerParent").get("location");
				id = plans.models[0].get("markerParent").id;
				that.mapMarker = plans.models[0].get("markerParent");
			}
			that.$el.html(that.template({title:title,id:id}));
			_.each(plans.models,function(model){
				var plan = new PlanView({model:model});
				that.$('.plan-list').append(plan.render().el);
			});
			//that.$el.modal('show'); The modal has already been shown, so we don't need to do it again
			that.$el.on('hidden.bs.modal', function () {
				router.navigate('',{trigger:true});
			});
			return that;
		});
	}
});

var ModalLoadingView = Parse.View.extend({
	tagName: 'div',
	template: _.template($("#modal-loading-template").html()),
	el:"#modal",
	render:function(){
		this.$el.html(this.template());
		this.$el.modal('show');
		this.$el.on('hidden.bs.modal', function () {
			router.navigate('',{trigger:true});
		});
	}
});



/***********************************************************************
 *
 *   Google Map Initialization
 *
 ***********************************************************************/

function initializeMarkers() {
	var MapMarker = Parse.Object.extend("MapMarker");
	var query = new Parse.Query(MapMarker);
	query.limit(1000);
	query.find({
		success: function(results) {
			console.log("Initializing map markers");
			//console.log("Num of markers: " + results.length);
			for (var i = 0; i < results.length; i++) {
				var object = results[i];
				var gl = (object.get("geoLocation"));
				var geo = new google.maps.LatLng(gl._latitude, gl._longitude);
				var marker = new google.maps.Marker({
					position: geo,
					map: map,
					title: object.get("location"),
					id: object.id
				});
				var listener = makeListenerFunction(marker);
				listener();
			}
		},
		error: function(error) {
			console.log("Error: " + error.code + error.message);
		}
	});
}

function geolocate() {
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(function(position) {
			var geolocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
			autocomplete.setBounds(new google.maps.LatLngBounds(geolocation,geolocation));
		});
	}
}

function autocompleteInitialize() {
	autocomplete = new google.maps.places.Autocomplete((document.getElementById('inputLocation')), { types: ['geocode'] });
	console.log("autocomplete successfully initialized");
}

function initialize() {
  var mapOptions = {
    zoom: 2,
    center: new google.maps.LatLng(40.4378271, -3.6795367)
  };
  map = new google.maps.Map(document.getElementById('map-canvas'),
      mapOptions);
  geocoder = new google.maps.Geocoder();
  initializeMarkers();
  router = new AppRouter();
  Parse.history.start();
}

var originalWindowWidth = window.innerWidth;
var criticalWidth = 960;

function loadScript() {
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyBB56byTSi_4iHy_hqH8zN3FQPgb2pm7UQ&sensor=false&libraries=places&' +
		'callback=initialize';
	document.body.appendChild(script);
	if(Parse.User.current()) {
		menuView.render();
	}

	if (window.innerWidth < criticalWidth){
	    $('#find-fb-friends-btn-content').html("&nbsp;Find Friends");
		$('#find-nearby-btn-content').html("&nbsp;Find Nearby");
		$('#share-plan-btn-content').html("&nbsp;Share Plan");
	}

	window.onresize = function() {
    	if (originalWindowWidth >= criticalWidth && window.innerWidth < criticalWidth){
    		$('#find-fb-friends-btn-content').html("&nbsp;Find Friends");
    		$('#find-nearby-btn-content').html("&nbsp;Find Nearby");
    		$('#share-plan-btn-content').html("&nbsp;Share Plan");
    	}
    	if (originalWindowWidth <= criticalWidth && window.innerWidth > criticalWidth){
    		$('#find-fb-friends-btn-content').html("&nbsp;Find my Facebook friends");
    		$('#find-nearby-btn-content').html("&nbsp;Find who will be nearby");
    		$('#share-plan-btn-content').html("&nbsp;Share your travel plans!");
    	}
    	originalWindowWidth = window.innerWidth;
	};
	window.onresize();
}


window.onload = loadScript;

/************************************************************
 *
 *  Find Travel Buddies In Your Destination
 *
 ************************************************************/

var LocationView = Parse.View.extend({
	tagName: 'div',
	template:_.template($('#choose-location-template').html()),
	render:function(){
		this.$el.html(this.template({plan:this.model}));
		return this;
	}
})

var FindNearbyView = Parse.View.extend({
	tagName: 'div',
	el: '#modal',
	template:_.template($('#plan-list-template').html()),
	collection: new PlanCollection(),
	render: function(id) {
		modalLoadingView.render();
		var query = new Parse.Query("MapMarker");
		query.equalTo("objectId", id);
		var there = this;
		query.find({
			success: function(results) {
				var geoPoint = results[0].get("geoLocation");
				var cityName = results[0].get("location");
				var MM = Parse.Object.extend("MapMarker");
				var innerQuery = new Parse.Query(MM).withinMiles("geoLocation", geoPoint, nearbyMiles);
				there.collection.query = (new Parse.Query(Plan)).include("parent").matchesQuery("markerParent", innerQuery).include("markerParent");
				var that = there; //scope is lost inside the collection.fetch
				there.collection.fetch().done(function(plans){ //fetch the collection (PlanCollection)
					var title = "Find Travel Buddies";
					if(plans.models.length){
						title = "Travel buddies in " + cityName;
					}
					that.$el.html(that.template({title:title,id:undefined}));
					_.each(plans.models,function(model){
						var plan = new PlanView({model:model});
						that.$('.plan-list').append(plan.render().el);
					});

					//that.$el.modal('show'); The modal has already been shown, so we don't need to do it again
					that.$el.on('hidden.bs.modal', function () {
						router.navigate('',{trigger:true});
					});
					return that;
				});
			}
		});
	}
});

// Returns a collection of location you will be over the summer
var ChooseLocationView = Parse.View.extend({
	tagName: 'div',
	el: "#modal",
	template:_.template($('#plan-list-template').html()),
	collection: new PlanCollection(),
	render: function() {
		$('#find-nearby-btn').button('loading');
		modalLoadingView.render();
		this.collection.query = (new Parse.Query(Plan)).include("parent").equalTo("parent",Parse.User.current()).include("markerParent");
		var that = this; //scope is lost inside the collection.fetch
		this.collection.fetch().done(function(plans){ //fetch the collection (PlanCollection)

			var title = "Choose a location";

			that.$el.html(that.template({title:title,id:undefined}));
			_.each(plans.models,function(model){
				var plan = new LocationView({model:model});
				that.$('.plan-list').append(plan.render().el);
			});
			//that.$el.modal('show'); The modal has already been shown, so we don't need to do it again
			that.$el.on('hidden.bs.modal', function () {
				$('#find-nearby-btn').button('reset');
				router.navigate('',{trigger:true});
			});
			return that;
		});
	}
});

/************************************************************
 *
 *  Find Users Nearby
 *
 ************************************************************/

var NearbyView = Parse.View.extend({
	tagName: 'div',
	el: "#modal",
	template:_.template($('#plan-list-template').html()),
	collection: new PlanCollection(),
	render: function(id) {
		modalLoadingView.render();
		myPoint = Parse.User.current().get("location");
		var innerQuery = new Parse.Query("User");
		innerQuery.near("location", myPoint);
		this.collection.query = (new Parse.Query(Plan)).include("parent").matchesQuery("parent", innerQuery).include("markerParent").notEqualTo("parent", Parse.User.current());
		var that = this;
		this.collection.fetch().done(function(plans){ //fetch the collection (PlanCollection)
			var title = "Find Who's Nearby";
			that.$el.html(that.template({title:title,id:undefined}));
			_.each(plans.models,function(model){
				var plan = new PlanView({model:model});
				that.$('.plan-list').append(plan.render().el);
			});
			//that.$el.modal('show'); The modal has already been shown, so we don't need to do it again
			that.$el.on('hidden.bs.modal', function () {
				router.navigate('',{trigger:true});
			});
			return that;
		});
	}
});

/************************************************************
 *
 *  My Plans View
 *
 ************************************************************/

var MyPlansView = Parse.View.extend({
	tagName: 'div',
	el: "#modal",
	template:_.template($('#plan-list-template').html()),
	collection: new PlanCollection(),
	render: function() {
		modalLoadingView.render();
		this.collection.query = (new Parse.Query(Plan)).include("parent").equalTo("parent",Parse.User.current()).include("markerParent");
		var that = this; //scope is lost inside the collection.fetch
		this.collection.fetch().done(function(plans){ //fetch the collection (PlanCollection)
			//fetch all the likes for the plans that were loaded
			(new Parse.Query("PlanLike")).include('user').containedIn("plan",plans.models).find().done(function(results){
				var likes = {};
				for(var i = 0;i<results.length;i++){
					if(!likes[results[i].get("plan").id]){
						likes[results[i].get("plan").id] = [];
					}
					likes[results[i].get("plan").id].push(results[i]);
				}

				var title = "My Plans";

				that.$el.html(that.template({title:title,id:undefined}));
				_.each(plans.models,function(model){
					var plan = new PlanView({model:model});
					plan.likes = likes[model.id];
					that.$('.plan-list').append(plan.render().el);
				});

				//that.$el.modal('show'); The modal has already been shown, so we don't need to do it again
				that.$el.on('hidden.bs.modal', function () {
					router.navigate('',{trigger:true});
				});
				return that;
			});
		});
	}
});

/************************************************************
 *
 *  My Profile View
 *
 ************************************************************/

var MyProfileView = Parse.View.extend({
	tagName: 'div',
	el: "#modal",
	template:_.template($('#my-profile-template').html()),
	render: function() {
		modalLoadingView.render();
		var title = "My Profile";
		this.$el.html(this.template({user:Parse.User.current(),title:title}));
		this.$el.modal('show');
		this.$el.on('hidden.bs.modal', function () {
			router.navigate('',{trigger:true});
		});
	}
});

var EditProfileView = Parse.View.extend({
	events: {
		"click #save-profile": "save"
	},
	tagName: 'div',
	el: "#modal",
	template:_.template($('#edit-profile-template').html()),
	render: function() {
		modalLoadingView.render();
		var title = "Edit My Profile";
		this.$el.html(this.template({user:Parse.User.current(),title:title}));
		this.$el.modal('show');
		this.$el.on('hidden.bs.modal', function () {
			router.navigate('',{trigger:true});
		});
	},
	save: function() {
		$('#save-profile').button('loading');
		var firstName = this.$("#first-name").val();
		var lastName = this.$("#last-name").val();
		var email = this.$("#email").val();
		var fileUploadControl = this.$("#picture")[0];
		var user = Parse.User.current();
		if (fileUploadControl.files.length > 0) {
			var file = fileUploadControl.files[0];
			var name = "photo.png";
			var img = new Parse.File(name, file);
			var PP = Parse.Object.extend("ProfilePicture");
			var pp = new PP();
			pp.set("img", img);
			pp.set("parent", user);
			pp.save(null, {
				success: function(img) {
					console.log("new profile picture successfully saved");
					if (firstName != "") {
						user.set("firstName", firstName);
					}
					if (lastName != "") {
						user.set("lastName", lastName);
					}
					if (email != "") {
						user.setEmail(email);
					}
					user.set("imgURL", img.get('img').url());
					user.save(null, {
						success: function(user) {
							console.log("successfully updated user information");
							$('#save-profile').button('reset');
							router.navigate('myProfile',true);
						},
						error: function(user, error) {
							$('#save-profile').button('reset');
							console.log("Error: " + error.code + error.message);
						}
					});
				},
				error: function(user, error) {
					$('#save-profile').button('reset');
					console.log("Error: " + error.code + error.message);
				}
			});
		} else {
			if (firstName != "") {
				user.set("firstName", firstName);
			}
			if (lastName != "") {
				user.set("lastName", lastName);
			}
			if (email != "") {
				user.setEmail(email);
			}
			user.save(null, {
				success: function(user) {
					console.log("successfully updated user information");
					$('#save-profile').button('reset');
					router.navigate('myProfile',true);
				},
				error: function(user, error) {
					$('#save-profile').button('reset');
					console.log("Error: " + error.code + error.message);
				}
			});
		}
		return false;
	}
})

/************************************************************
 *
 *  Router / Routes
 *
 ************************************************************/

var planCollectionView = new PlanCollectionView();

var loginView = new LoginView();

var editPlanView = new EditPlanView();

var menuView = new NavBarMenuView();

var modalLoadingView = new ModalLoadingView();

var chooseLocationView = new ChooseLocationView();

var findNearbyView = new FindNearbyView();

var myPlansView = new MyPlansView();

var myProfileView = new MyProfileView();

var editProfileView = new EditProfileView();

var nearbyView = new NearbyView();

var AppRouter = Parse.Router.extend({
	routes: {
		"": "home",
		"myProfile":"myProfile",
		"editProfile":"editProfile",
		"login":"login",
		"logout":"logout",
		"plan/new":"newPlan",
		"plan/:id":"plan", //edit plan
		"new/:loc":"newPlanLoc",
		"location/:id":"location",
		"findNearby/:id":"findNearby",
		"findWhosNearby":"nearby",
		"chooseLocation":"chooseLocation",
		"myPlans":"myPlans"
	},
	nearby: function() {
		if (Parse.User.current()) {
			nearbyView.render();
		} else {
			this.afterLogin = "findWhosNearby";
			router.navigate('login',true);
		}
	},
	editProfile: function() {
		console.log("rendering edit profile view");
		editProfileView.render();
	},
	myProfile: function() {
		myProfileView.render();
	},
	myPlans: function() {
		myPlansView.render();
	},
	chooseLocation: function() {
		if (Parse.User.current()) {
			console.log("Please choose which location you want to use...");
			chooseLocationView.render(); // This will render a popup window to let you choose for which summer plan you want to find nearby friends
		} else {
			this.afterLogin = "chooseLocation";
			router.navigate('login',true);
		}
	},
	findNearby: function(id) {
		if (Parse.User.current()) {
			findNearbyView.render(id);
		} else {
			this.afterLogin = "findNeary/" + id;
			router.navigate('login',true);
		}
	},
	initialize: function(options) {
		this.afterLogin = "plan/new";
	},
	plan:function(id){
		if (Parse.User.current()) {
			editPlanView.render(id);
		} else {
			router.navigate('login',true);
		}
	},
	newPlanLoc:function(loc){
		if (Parse.User.current()) {
			var Plan = Parse.Object.extend("TravelPlan");
			var plan = new Plan();
			plan.set('markerParent',planCollectionView.mapMarker);
			editPlanView.render(plan);
		} else {
			router.navigate('login',true);
		}
	},
	newPlan:function(){
		if (Parse.User.current()) {
			editPlanView.render();
		} else {
			this.afterLogin = "plan/new";
			router.navigate('login',true);
		}
	},
	location:function(id){
		if (Parse.User.current()) {
			planCollectionView.render(id);
		} else {
			this.afterLogin = "location/"+id;
			router.navigate('login',true);
		}
	},
	home:function(){
		Parse.$('#modal').modal('hide');
	},
	login: function() {
		if(Parse.User.current()){
			router.navigate('',true);
		}else{
			loginView.render(this.afterLogin);
			this.afterLogin = "plan/new";
			menuView.render();
		}
	},
	logout:function(){
		if(Parse.User.current()){
			console.log("Logging out...");
			Parse.User.logOut();
			router.navigate('',true);
		}
		menuView.render();
		router.navigate('',{trigger:true});
	}
});

/************************************************************
 *
 *  Helper Functions
 *
 ************************************************************/

var getFacebookId = function(callback) {
	callback(Parse.User.current().get("authData").facebook.id);
};

var getCurrentUser = function(callback) {
	callback(Parse.User.current());
};

function makeListenerFunction(marker) {
	function result() {
		return google.maps.event.addListener(marker, 'click', function() {
			$("#find-neighbors-modal-label").html(marker.title).show();
			console.log(marker.title);
			router.navigate("location/"+marker.id,{trigger:true});
			
		});
	}
	return result;
}

var getLocation = function(callback) {
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(function(location) {
			callback(new Parse.GeoPoint({latitude: location.coords.latitude, longitude: location.coords.longitude}));
		});
	} else {
		throw new Error("Your browser doesn't support geolocation");
	}
};